import cron from 'node-cron';
import { Booking } from './../modules/booking/booking.model';
import { Restaurant } from './../modules/restaurant/restaurant.model';
import moment from 'moment';
import { isRestaurantOpen } from './../utils/restaurentTimeConvert';


const startBookingStatusJob = () => {
  // runs every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
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
      console.log(
        `[${moment().format(
          'hh:mm A'
        )}] Running restaurant status update job...`
      );

      const restaurants = await Restaurant.find();

      for (const restaurant of restaurants) {
        const { openTime, closeTime } = restaurant;

        const isOpen = isRestaurantOpen(openTime, closeTime);

        if (isOpen && restaurant.status !== 'Open') {
          restaurant?.status = 'Open';
          await restaurant.save();
        } else if (!isOpen && restaurant?.status !== 'Closed') {
          restaurant?.status = 'Closed';
          await restaurant.save();
        }
      }

      console.log('====> Restaurant statuses updated successfully.');
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
