import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Toaster } from '@/components/ui/toaster';
import { useLanguage } from '@/context/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { createBooking, getAvailableTimeSlots, getServiceGroups } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { ServiceDisplay, ServiceGroupDisplay } from '@shared/schema';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ar, de, enUS, tr } from 'date-fns/locale';
// import { CalendarIcon } from 'lucide-react'; // Removed
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

// Time slots will be fetched from the API for each date

const BookingSection = () => {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [bookingStep, setBookingStep] = useState<number>(1);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<ServiceDisplay | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Create a ref for the booking section container
  const bookingSectionRef = useRef<HTMLDivElement>(null);

  // Fetch services from API
  const { data: services = [], isLoading: isServicesLoading } = useQuery<ServiceDisplay[]>({
    queryKey: ['/api/services'],
  });

  // Fetch service groups from API
  const { data: serviceGroups = [], isLoading: isGroupsLoading } = useQuery<ServiceGroupDisplay[]>({
    queryKey: ['/api/service-groups'],
    queryFn: getServiceGroups,
  });

  // Filter services by selected category
  const filteredServices = selectedCategory
    ? services.filter(service => service.category === selectedCategory)
    : [];

  // Loading state for components
  const isLoading = isServicesLoading || isGroupsLoading;

  // Form setup with toast hook
  const { toast } = useToast();
  const form = useForm({
    defaultValues: {
      name: '',
      email: '',
      phone: '',
    },
  });

  // Get correct date locale based on selected language
  const getDateLocale = () => {
    switch (language) {
      case 'ar':
        return ar;
      case 'de':
        return de;
      case 'tr':
        return tr;
      default:
        return enUS;
    }
  };

  // When category is selected, open the service selection modal if there are services
  useEffect(() => {
    if (selectedCategory) {
      const timer = setTimeout(() => {
        setServiceModalOpen(true);
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [selectedCategory]);

  // Handle service auto-selection from URL parameters
  useEffect(() => {
    if (services.length === 0) return; // Wait until services are loaded

    // Get the service slug from URL if present
    const hash = window.location.hash;
    if (hash?.includes('?service=')) {
      const serviceSlug = hash.split('?service=')[1];

      // Find the service by slug
      const serviceToSelect = services.find(s => s.slug === serviceSlug);

      if (serviceToSelect) {
        // Set the category first
        setSelectedCategory(serviceToSelect.category);

        // Then select the service
        setSelectedService(serviceToSelect);

        // Show a success toast for better UX
        toast({
          title: t('serviceSelected'),
          description: serviceToSelect.name[language] || serviceToSelect.name.en,
          duration: 2000,
        });

        // Clean the URL to prevent reselection on refresh
        if (window.history.replaceState) {
          window.history.replaceState(null, '', '#booking');
        }
      }
    }
  }, [services, language, t, toast]);

  // Helper function to maintain scroll position when changing steps
  const changeStepWithoutJump = (newStep: number) => {
    // Get the current container position
    const containerTop = bookingSectionRef.current?.getBoundingClientRect().top || 0;
    const scrollTop = window.scrollY + containerTop;

    // Change step
    setBookingStep(newStep);

    // Maintain position after render
    setTimeout(() => {
      window.scrollTo({
        top: scrollTop,
        behavior: 'instant', // More modern alternative to "auto", prevents any animation
      });
    }, 0);
  };

  // Process to next step
  const nextStep = () => {
    if (bookingStep < 3) {
      changeStepWithoutJump(bookingStep + 1);
    }
  };

  // Go back to previous step
  const prevStep = () => {
    if (bookingStep > 1) {
      changeStepWithoutJump(bookingStep - 1);
    }
  };

  // Handle category selection
  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategory(categoryId);

    if (!selectedService || selectedService.category !== categoryId) {
      setSelectedService(null);
    }
  };

  // Handle service selection
  const handleServiceSelect = (service: ServiceDisplay) => {
    setSelectedService(service);

    // Add a slight delay before closing the modal for a better user experience
    setTimeout(() => {
      setServiceModalOpen(false);

      // Show a success toast when service is selected
      toast({
        title: t('serviceSelected'),
        description: service.name[language] || service.name.en,
        duration: 2000,
      });
    }, 300);
  };

  // Handle form submission
  const onSubmit = async (data: { name: string; email: string; phone: string }) => {
    if (!selectedService || !selectedDate || !selectedTime) {
      return;
    }

    // Prepare booking data
    const bookingData = {
      ...data,
      service: selectedService.id, // Use ID for the database
      serviceSlug: selectedService.slug, // Keep slug for reference if needed
      serviceName: selectedService.name[language] || selectedService.name.en,
      date: format(selectedDate, 'yyyy-MM-dd'),
      time: selectedTime,
      price: selectedService.price,
      duration: selectedService.duration,
    };

    try {
      // Submit to server using the API function from our centralized client
      const result = await createBooking(bookingData);

      if (result.success) {
        // Show success toast notification
        toast({
          title: t('bookingSuccess'),
          description: t('bookingConfirmation'),
          duration: 5000,
        });

        // Reset form
        form.reset();
        setSelectedService(null);
        setSelectedDate(undefined);
        setSelectedTime(null);
        setBookingStep(1);
      } else {
        // Show error toast
        toast({
          title: t('bookingError'),
          description: result.message || t('bookingErrorMsg'),
          variant: 'destructive',
          duration: 5000,
        });
      }
    } catch {
      // Show error toast
      toast({
        title: t('bookingError'),
        description: t('bookingErrorMsg'),
        variant: 'destructive',
        duration: 5000,
      });
    }
  };

  return (
    <section ref={bookingSectionRef} id="booking" className="py-16 bg-pink-light">
      {/* Add Toaster component for toast notifications */}
      <Toaster />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="royal-heading text-3xl md:text-4xl mb-8">{t('bookingTitle')}</h2>
          <div className="fancy-divider mb-4">
            <i className="fas fa-calendar-alt fancy-divider-icon text-gold mx-2" />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg overflow-hidden max-w-4xl mx-auto">
          {/* Booking Steps */}
          <div className="flex border-b">
            <div
              className={`booking-step flex-1 py-4 text-center border-r border-gray-200 cursor-pointer ${bookingStep === 1 ? 'active' : ''}`}
              onClick={() => changeStepWithoutJump(1)}
            >
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full ${bookingStep === 1 ? 'bg-[rgb(141,91,108)]' : 'bg-gray-200'} flex items-center justify-center mb-1 transition-all duration-300`}
                >
                  <i
                    className={`fas fa-spa ${bookingStep === 1 ? 'text-white' : 'text-gray-500'}`}
                  />
                </div>
                <span
                  className="text-sm font-medium transition-all duration-300"
                  style={{ color: bookingStep === 1 ? 'white' : 'inherit' }}
                >
                  1. {t('selectService')}
                </span>
              </div>
            </div>
            <div
              className={`booking-step flex-1 py-4 text-center border-r border-gray-200 cursor-pointer ${bookingStep === 2 ? 'active' : ''}`}
              onClick={() => selectedService && changeStepWithoutJump(2)}
            >
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full ${bookingStep === 2 ? 'bg-[rgb(141,91,108)]' : 'bg-gray-200'} flex items-center justify-center mb-1 transition-all duration-300`}
                >
                  <i
                    className={`fas fa-calendar-alt ${bookingStep === 2 ? 'text-white' : 'text-gray-500'}`}
                  />
                </div>
                <span
                  className="text-sm font-medium transition-all duration-300"
                  style={{ color: bookingStep === 2 ? 'white' : 'inherit' }}
                >
                  2. {t('dateTime')}
                </span>
              </div>
            </div>
            <div
              className={`booking-step flex-1 py-4 text-center cursor-pointer ${bookingStep === 3 ? 'active' : ''}`}
              onClick={() => selectedDate && selectedTime && changeStepWithoutJump(3)}
            >
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full ${bookingStep === 3 ? 'bg-[rgb(141,91,108)]' : 'bg-gray-200'} flex items-center justify-center mb-1 transition-all duration-300`}
                >
                  <i
                    className={`fas fa-user ${bookingStep === 3 ? 'text-white' : 'text-gray-500'}`}
                  />
                </div>
                <span
                  className="text-sm font-medium transition-all duration-300"
                  style={{ color: bookingStep === 3 ? 'white' : 'inherit' }}
                >
                  3. {t('yourDetails')}
                </span>
              </div>
            </div>
          </div>

          {/* Step 1: Service Selection */}
          {bookingStep === 1 && (
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {isLoading
                  ? // Loading state
                    Array(4)
                      .fill(0)
                      .map((_, index) => (
                        <div
                          key={`loading-skeleton-${index}-${Date.now()}`}
                          className="border rounded-lg p-4 animate-pulse"
                        >
                          <div className="h-5 bg-gray-200 rounded w-1/2 mb-2" />
                          <div className="h-4 bg-gray-100 rounded w-3/4" />
                        </div>
                      ))
                  : // Display service groups
                    serviceGroups.map(group => (
                      <div
                        key={group.id}
                        onClick={() => handleCategorySelect(group.slug)}
                        className={`border rounded-lg p-4 hover:border-pink cursor-pointer transition-all duration-300 ${
                          selectedCategory === group.slug
                            ? 'border-pink-dark bg-pink-light shadow-md service-selected scale-[1.02] transform-gpu'
                            : 'hover:shadow-sm hover:bg-pink-lightest'
                        }`}
                      >
                        <h5 className="font-small mb-2">
                          {group.name[language as keyof typeof group.name] || group.name.en}
                        </h5>
                        {group.description && (
                          <div className="text-sm text-gray-600">
                            {group.description[language as keyof typeof group.description] ||
                              group.description.en}
                          </div>
                        )}
                      </div>
                    ))}
              </div>

              {/* Selected Service Display */}
              {selectedService && (
                <div className="bg-gradient-to-r from-pink-lightest via-pink-lightest/50 to-white border-2 border-pink rounded-lg overflow-hidden mb-6 shadow-lg transition-all duration-300 animate-fadeIn service-selected">
                  <div className="p-4">
                    <div className="flex items-center mb-2">
                      <div className="w-6 h-6 rounded-full bg-pink-dark flex items-center justify-center mr-3 shadow-sm">
                        <i className="fas fa-check text-white text-xs" />
                      </div>
                      <h4 className="font-medium text-gray-800">{t('selectedService')}</h4>
                    </div>

                    <div className="flex">
                      {selectedService.imageUrl && (
                        <div className="w-24 h-24 rounded-lg overflow-hidden mr-4 ring-4 ring-pink ring-opacity-30 shadow-inner hidden sm:block pulse-border">
                          <img
                            src={selectedService.imageUrl}
                            alt={selectedService.name[language] || selectedService.name.en}
                            className="w-full h-full object-cover transform transition-transform duration-700 hover:scale-110"
                          />
                        </div>
                      )}

                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-pink-dark mb-1">
                          {selectedService.name[language] || selectedService.name.en}
                        </h3>
                        <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                          {selectedService.description[language] || selectedService.description.en}
                        </p>
                        <div className="flex flex-wrap items-center text-sm">
                          <span className="bg-white/70 backdrop-blur-sm px-3 py-1 rounded-full shadow-sm text-gray-700 mr-3 mb-1 border border-pink/30">
                            <i className="far fa-clock mr-1" /> {selectedService.duration}{' '}
                            {t('minutes')}
                          </span>
                          <span className="bg-white/70 backdrop-blur-sm px-3 py-1 rounded-full shadow-sm text-gray-700 mb-1 border border-pink/30">
                            <i className="fas fa-money-bill-alt mr-1" /> {selectedService.price} €{' '}
                            {/* Changed far to fas */}
                          </span>
                        </div>
                      </div>

                      <Button
                        onClick={() => setServiceModalOpen(true)}
                        size="sm"
                        className="btn-royal text-white ml-4 self-start shadow-md hover-lift"
                      >
                        {t('change')}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Action buttons in one row */}
              <div className="flex flex-col sm:flex-row justify-between items-center gap-3 mt-8">
                <Button
                  onClick={() => setServiceModalOpen(true)}
                  variant="outline"
                  className="w-full sm:w-auto hover-lift"
                >
                  {t('viewAllServices')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => form.reset()}
                  className="w-full sm:w-auto hover-lift"
                >
                  {t('cancel')}
                </Button>
                <Button
                  disabled={!selectedService}
                  onClick={nextStep}
                  className="btn-royal text-white hover-lift w-full sm:w-auto"
                >
                  {t('continue')}
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Date & Time Selection */}
          {bookingStep === 2 && (
            <div className="p-6">
              <h3 className="font-semibold text-xl mb-4">{t('selectDateTime')}</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Date Selection */}
                <div>
                  <h4 className="font-medium mb-3">{t('selectDate')}</h4>
                  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !selectedDate && 'text-muted-foreground'
                        )}
                      >
                        <i className="fas fa-calendar-alt mr-2 h-4 w-4" />{' '}
                        {/* Replaced Lucide icon */}
                        {selectedDate ? (
                          format(selectedDate, 'PPP', {
                            locale: getDateLocale(),
                          })
                        ) : (
                          <span>{t('pickDate')}</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={date => {
                          setSelectedDate(date);
                          setCalendarOpen(false); // Close the popover when a date is selected
                          // Reset time when date changes
                          setSelectedTime(null);
                        }}
                        initialFocus
                        locale={getDateLocale()}
                        // Disable dates in the past
                        disabled={date => {
                          // Disable all dates before today
                          return date < new Date(new Date().setHours(0, 0, 0, 0));
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Time Selection */}
                <div>
                  <h4 className="font-medium mb-3">{t('selectTime')}</h4>

                  {/* Fetch available time slots for the selected date */}
                  {selectedDate ? (
                    <AvailableTimeSlots
                      date={selectedDate}
                      serviceId={selectedService?.id}
                      selectedTime={selectedTime}
                      onSelectTime={setSelectedTime}
                    />
                  ) : (
                    <div className="text-center text-gray-500 p-4 border rounded-md">
                      {t('selectDateFirst')}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-between mt-8">
                <Button variant="outline" onClick={prevStep} className="hover-lift">
                  {t('back')}
                </Button>
                <Button
                  disabled={!selectedDate || !selectedTime}
                  onClick={nextStep}
                  className="btn-royal text-white hover-lift"
                >
                  {t('continue')}
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Personal Details */}
          {bookingStep === 3 && (
            <div className="p-6">
              <h3 className="font-semibold text-xl mb-4">{t('enterDetails')}</h3>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t('formName')} <span className="text-pink">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input placeholder={t('yourName')} {...field} required />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t('formEmail')} <span className="text-pink">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input type="email" placeholder={t('yourEmail')} {...field} required />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t('formPhone')} <span className="text-pink">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input type="tel" placeholder={t('yourPhone')} {...field} required />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {/* Booking Summary */}
                  <div className="bg-beige-light p-4 rounded-lg my-6 shadow-md">
                    <h4 className="font-medium mb-3">{t('bookingSummary')}</h4>
                    <div className="text-sm">
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <span className="text-gray-600 flex items-center">
                          <i className="fas fa-check-circle text-pink mr-2" />
                          {t('service')}:
                        </span>
                        <span className="font-medium text-pink-dark">
                          {selectedService &&
                            (selectedService.name[language] || selectedService.name.en)}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-1">
                        <span className="text-gray-600">{t('duration')}:</span>
                        <span className="font-medium">
                          {selectedService && `${selectedService.duration} ${t('minutes')}`}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-1">
                        <span className="text-gray-600">{t('price')}:</span>
                        <span className="font-medium">
                          {selectedService && `${selectedService.price} €`}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-1">
                        <span className="text-gray-600">{t('date')}:</span>
                        <span className="font-medium">
                          {selectedDate &&
                            format(selectedDate, 'PPP', {
                              locale: getDateLocale(),
                            })}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-1">
                        <span className="text-gray-600">{t('time')}:</span>
                        <span className="font-medium">{selectedTime}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-8">
                    <div className="flex justify-between mb-6">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={prevStep}
                        className="hover-lift"
                      >
                        {t('back')}
                      </Button>

                      <Button
                        type="submit"
                        className="btn-royal shadow-lg transition-all text-white px-8 py-3 font-medium relative hover-lift"
                        disabled={
                          !form.watch('name') || !form.watch('email') || !form.watch('phone')
                        }
                      >
                        {t('confirmBooking')} <i className="ml-2 fas fa-check" />
                      </Button>
                    </div>

                    {/* Required fields note */}
                    <div className="text-center mt-2 text-xs text-gray-500 border-t pt-3">
                      <span className="text-pink">*</span> {t('requiredFields')}
                    </div>
                  </div>
                </form>
              </Form>
            </div>
          )}
        </div>
      </div>

      {/* Service Selection Modal */}
      <Dialog open={serviceModalOpen} onOpenChange={setServiceModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t('selectSpecificService')}</DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <div className="flex justify-center p-6">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink" />
            </div>
          ) : services && services.length > 0 ? (
            <div className="space-y-4">
              {/* Category filter buttons */}
              <div className="flex flex-wrap gap-2 px-1">
                <Button
                  variant={!selectedCategory ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedCategory(null)}
                  className="text-xs hover-lift"
                >
                  {t('allServices')}
                </Button>

                {serviceGroups.map(group => (
                  <Button
                    key={group.id}
                    variant={selectedCategory === group.slug ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedCategory(group.slug)}
                    className="text-xs hover-lift"
                  >
                    {group.name[language as keyof typeof group.name] || group.name.en}
                  </Button>
                ))}
              </div>

              {/* Service list */}
              <div className="max-h-[400px] overflow-y-auto">
                {(selectedCategory ? filteredServices : services).map(service => (
                  <div
                    key={service.id}
                    onClick={() => handleServiceSelect(service)}
                    className={`p-3 mb-2 border rounded-md cursor-pointer transition-all duration-300 
                      ${
                        selectedService && selectedService.id === service.id
                          ? 'border-pink bg-gradient-to-r from-pink-lightest via-pink-lightest/50 to-white shadow-md scale-[1.02] transform-gpu pulse-border service-selected'
                          : 'hover:bg-pink-lightest hover:border-pink-light hover:shadow-sm'
                      }`}
                  >
                    <div className="flex items-start">
                      {service.imageUrl && (
                        <div
                          className={`w-16 h-16 rounded overflow-hidden flex-shrink-0 mr-3 ${selectedService && selectedService.id === service.id ? 'ring-2 ring-pink ring-opacity-60' : ''}`}
                        >
                          <img
                            src={service.imageUrl}
                            alt={service.name[language] || service.name.en}
                            className={`w-full h-full object-cover transition-all ${selectedService && selectedService.id === service.id ? 'scale-105' : ''}`}
                          />
                        </div>
                      )}
                      <div className="flex-1">
                        <h5
                          className={`font-medium ${selectedService && selectedService.id === service.id ? 'text-pink-dark font-semibold' : 'text-pink-dark'}`}
                        >
                          {service.name[language] || service.name.en}
                        </h5>
                        <p className="text-sm text-gray-600 mb-1">
                          {service.description[language] || service.description.en}
                        </p>
                        <div className="flex text-sm text-gray-500">
                          <span className="mr-3">
                            {service.duration} {t('minutes')}
                          </span>
                          <span>{service.price} €</span>
                        </div>
                      </div>
                      {selectedService && selectedService.id === service.id && (
                        <div className="ml-2 text-pink">
                          <i className="fas fa-check-circle" />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-6 text-center text-gray-500">{t('noServicesAvailable')}</div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setServiceModalOpen(false)}
              className="hover-lift"
            >
              {t('cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
};

// Available Time Slots Component
interface AvailableTimeSlotsProps {
  date: Date;
  serviceId?: number;
  selectedTime: string | null;
  onSelectTime: (time: string) => void;
}

const AvailableTimeSlots = ({
  date,
  serviceId,
  selectedTime,
  onSelectTime,
}: AvailableTimeSlotsProps) => {
  const { t } = useTranslation();
  const { language: _language } = useLanguage();

  // Format date for API request
  const formattedDate = format(date, 'yyyy-MM-dd');

  // Helper function to check if a date is today
  const isToday = (someDate: Date) => {
    const today = new Date();
    return (
      someDate.getDate() === today.getDate() &&
      someDate.getMonth() === today.getMonth() &&
      someDate.getFullYear() === today.getFullYear()
    );
  };

  // Generate fallback time slots (for demonstration when API fails)
  const generateFallbackTimeSlots = () => {
    const now = new Date();
    const currentHour = now.getHours();
    const isDateToday = isToday(date);

    // Base time slots
    let slots = [
      '10:00',
      '11:00',
      '12:00',
      '13:00',
      '14:00',
      '15:00',
      '16:00',
      '17:00',
      '18:00',
      '19:00',
    ];

    // If the selected date is today, filter out past time slots
    if (isDateToday) {
      slots = slots.filter(slot => {
        const [hours] = slot.split(':').map(Number);
        return hours > currentHour;
      });
    }

    // Randomly remove some slots to simulate real availability
    return slots.filter(() => Math.random() > 0.3);
  };

  // Fetch available time slots from API
  const {
    data,
    isLoading,
    error,
    refetch: _refetch,
    isFetching,
  } = useQuery<{ availableSlots: string[] }>({
    queryKey: ['/api/time-slots', formattedDate, serviceId],
    queryFn: () => getAvailableTimeSlots(formattedDate, serviceId),
    enabled: !!date,
    retry: 2,
    retryDelay: 1000,
    refetchOnWindowFocus: false,
    staleTime: 0,
  });

  // Handle errors in useEffect instead of onError prop
  useEffect(() => {
    if (error) {
      // API call failed, will use fallback time slots
    }
  }, [error]);

  if (isLoading || isFetching) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="h-10 bg-gray-100 animate-pulse rounded-md" />
        ))}
      </div>
    );
  }

  // Use fallback time slots if the API call fails
  if (error || !data || !('availableSlots' in data) || !data.availableSlots) {
    // Generate fallback time slots and display them
    const fallbackSlots = generateFallbackTimeSlots();

    if (fallbackSlots.length === 0) {
      return (
        <div className="text-center text-gray-500 p-4 border rounded-md">
          {t('noTimeSlotsAvailable')}
          <p className="mt-2 text-sm">{t('tryAnotherDate')}</p>
        </div>
      );
    }

    return (
      <div>
        <div className="text-xs text-amber-600 mb-3 px-1">{t('usingFallbackSchedule')}</div>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {fallbackSlots.map(time => (
            <Button
              key={time}
              variant={selectedTime === time ? 'default' : 'outline'}
              className="hover-lift"
              onClick={() => onSelectTime(time)}
            >
              {time}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  if (data && 'availableSlots' in data && data.availableSlots.length === 0) {
    return (
      <div className="text-center text-gray-500 p-4 border rounded-md">
        {t('noTimeSlotsAvailable')}
        <p className="mt-2 text-sm">{t('tryAnotherDate')}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
      {data &&
        'availableSlots' in data &&
        data.availableSlots.map((time: string) => (
          <Button
            key={time}
            variant={selectedTime === time ? 'default' : 'outline'}
            className="hover-lift"
            onClick={() => onSelectTime(time)}
          >
            {time}
          </Button>
        ))}
    </div>
  );
};

export default BookingSection;
