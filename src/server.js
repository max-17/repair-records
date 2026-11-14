import 'dotenv/config';
import {createRuntimeApp} from './runtime.js';
const app=createRuntimeApp();
app.listen(process.env.PORT||3000,()=>console.log('Repair API listening'));
