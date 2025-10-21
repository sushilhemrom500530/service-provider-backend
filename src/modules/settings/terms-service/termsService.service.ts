import { Types } from 'mongoose';
import AppError from '../../errors/AppErro';
import { StatusCodes } from 'http-status-codes';
 

const getAllTermsFromDB = async ( ) => {
   const result = {name:"sushil", id:"20259"} ;
   return result;
};


const getSingleTermsFromDB = async ( ) => {
   const result = {name:"sushil", id:"20259"} ;
   return result;
};


const addTermsIntoDB = async ( ) => {
   const result = {name:"sushil", id:"20259"} ;
   return result;
};


const updateTermsFromDB = async ( ) => {
   const result = {name:"sushil", id:"20259"} ;
   return result;
};


const deleteTermsFromDB = async ( ) => {
   const result = {name:"sushil", id:"20259"} ;
   return result;
};
 
export const TermsAndServiceService = {
  getAllTermsFromDB,
  getSingleTermsFromDB,
  addTermsIntoDB,
  updateTermsFromDB,
  deleteTermsFromDB
};