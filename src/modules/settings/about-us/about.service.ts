import { Types } from 'mongoose';
import AppError from '../../errors/AppErro';
import { StatusCodes } from 'http-status-codes';
 

const getAllAboutFromDB = async ( ) => {
   const result = {name:"sushil", id:"20259"} ;
   return result;
};


const getSingleAboutFromDB = async ( ) => {
   const result = {name:"sushil", id:"20259"} ;
   return result;
};


const addAboutIntoDB = async ( ) => {
   const result = {name:"sushil", id:"20259"} ;
   return result;
};


const updateAboutFromDB = async ( ) => {
   const result = {name:"sushil", id:"20259"} ;
   return result;
};


const deleteAboutFromDB = async ( ) => {
   const result = {name:"sushil", id:"20259"} ;
   return result;
};
 
export const AboutUsService = {
  getAllAboutFromDB,
  getSingleAboutFromDB,
  addAboutIntoDB,
  updateAboutFromDB,
  deleteAboutFromDB
};