import moment from 'moment';

export function isRestaurantOpen(openTime: string, closeTime: string): boolean {
  const now = moment();
  const open = moment(openTime, ['h:mm A']);
  const close = moment(closeTime, ['h:mm A']);
  
  if (close.isBefore(open)) close.add(1, 'day');
   

  return now.isBetween(open, close);
}
