import cron from 'node-cron';
import { Booking } from './../modules/booking/booking.model';
 
export const startBookingStatusJob = () => {
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
