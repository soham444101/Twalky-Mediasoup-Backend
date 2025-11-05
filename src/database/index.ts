import {connect} from "mongoose"
import { Db_Name } from "../constant";
export const connectDb= async()=>{

    try {
        const connectStatus= await connect(`${process.env.MONGODB_URL}/${Db_Name}`);
        console.log("Connection Status",connectStatus?.connection?.host)
    } catch (error) {
        console.error("Error In Index.ts in Db/index.ts",error)
        process.exit(1);
    }
}