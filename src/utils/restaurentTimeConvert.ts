import moment from 'moment-timezone';

// Ensure local timezone (change if needed)
moment.tz.setDefault('Asia/Dhaka');

export function isRestaurantOpen(openTime: string, closeTime: string): boolean {
  const now = moment();

  // Attach today's date explicitly
  const today = now.format('YYYY-MM-DD');
  const open = moment.tz(
    `${today} ${openTime}`,
    'YYYY-MM-DD h:mm A',
    'Asia/Dhaka'
  );
  const close = moment.tz(
    `${today} ${closeTime}`,
    'YYYY-MM-DD h:mm A',
    'Asia/Dhaka'
  );


  if (close.isSameOrBefore(open)) {
    close.add(1, 'day');
  }

 return now.isSameOrAfter(open) && now.isBefore(close);
}

// import moment from 'moment';

// export function isRestaurantOpen(openTime: string, closeTime: string): boolean {
//   const today = moment().format('YYYY-MM-DD');

//   // Combine today's date with the open/close times
//   const open = moment(`${today} ${openTime}`, 'YYYY-MM-DD h:mm A');
//   const close = moment(`${today} ${closeTime}`, 'YYYY-MM-DD h:mm A');
//   const now = moment();

//   if (close.isBefore(open)) {
//     close.add(1, 'day');
//   }

//   return now.isBetween(open, close);
// }
