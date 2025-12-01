export const isPastDate = (input: Date | string): boolean => {
  const now = new Date();
  const date = new Date(input);
  return date.getTime() < now.getTime();
};
