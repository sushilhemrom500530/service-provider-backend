
export function generateTransactionId(prefix: string = "stripe-trans"): string {
  // Create a random 8-character alphanumeric string
  const randomPart = Math.random().toString(36).substring(2, 10).toUpperCase();

  // Combine prefix with random part
  const transactionId = `${prefix}-${randomPart}`;

  return transactionId;
}