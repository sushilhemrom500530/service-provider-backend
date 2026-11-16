import { z } from 'zod'; 


const addWallet = z.object({
  body: z.object({
    accountType: z
      .string({
        required_error: 'Account Type is required',
        invalid_type_error: 'Account Type must be a string',
      })
      .min(1, 'Account Type cannot be empty'),
    cardNumber: z.union([z.number(), z.string().regex(/^[\d\s]{4,40}$/, 'Card Number must contain digits')]), 

    cardHolderName: z.string({
      required_error: 'card Holder Name is required',
    }), 
  }),
});


export const WalletValidations = {
    addWallet   
}