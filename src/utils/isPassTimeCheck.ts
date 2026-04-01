// export const isPastDate = (input: Date | string): boolean => {
//   const now = new Date();
//   const date = new Date(input);
//   return date.getTime() < now.getTime();
// };

export const isPastDate = (
  input: Date | string,
  toleranceMinutes = 10,
): boolean => {
  const now = new Date();

  const date = new Date(input);

  // Handle invalid date (important for "2026-04-31")
  if (isNaN(date.getTime())) {
    throw new Error('Invalid date provided');
  }

  // Subtract tolerance from current time
  const toleranceMs = toleranceMinutes * 60 * 1000;
  const thresholdTime = now.getTime() - toleranceMs;

  return date.getTime() < thresholdTime;
};
