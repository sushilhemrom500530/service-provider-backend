import cron from 'node-cron';
import { Booking } from './../modules/booking/booking.model';

 const startBookingStatusJob = () => {
  // runs each hours
  cron.schedule('0 * * * *', async () => {
    const now = new Date();
    await Booking.updateMany(
      { endDateAndTime: { $lt: now }, bookingStatus: { $ne: 'Completed' } },
      { $set: { bookingStatus: 'Completed' } }
    );
    console.log('Auto booking status updated.');
  });

  console.log('=====> Booking auto-update cron job started.');
};

  const startRestaurantStatusJob = () => {
  cron.schedule('*/5 * * * *', async () => {
    try {
      const restaurants = await Restaurant.find({});

      for (const restaurant of restaurants) {
        const status = getRestaurantStatus(
          restaurant.openTime,
          restaurant.closeTime
        );
        // Only update if status has changed to reduce writes
        if (restaurant.restaurantStatus !== status) {
          await Restaurant.findByIdAndUpdate(restaurant._id, {
            restaurantStatus: status,
          });
        }
      }

      console.log('✅ Restaurant statuses auto-updated.');
    } catch (err) {
      console.error('Error updating restaurant statuses:', err);
    }
  });

  console.log('=====> Restaurant status cron job started.');
};

export const startAllCronJobs = () => {
  startBookingStatusJob();
  startRestaurantStatusJob();
};
