import { NextRequest } from "next/server";
import { number, z, ZodTypeAny } from "zod";

const determineSchemaType = (schema: any) => {
    if(!schema.hasOwnProperty("type")){
        if(Array.isArray(schema)){
            return "array";
        }else{
            return typeof schema;
        };
    };
};
const jsonSchemaToZod = (schema: any):ZodTypeAny => {
    const type = determineSchemaType(schema);
    switch (type) {
        case "string":
            return z.string().nullable();
        case "number":
            return z.number().nullable();
        case "boolean":
            return z.boolean().nullable();
        case "array":
            return z.array(jsonSchemaToZod(schema.items)).nullable();
        case "object":
            const shape: Record<string, ZodTypeAny> = {};
            for(const key in schema){
                if(key != "type"){
                    shape[key] = jsonSchemaToZod(schema[key])
                }
            };
            return z.object(shape);

        default:
            throw new Error(`Unknown schema type: ${type}`);
    };
        
};


export const POST = async(req:NextRequest)=>{
    const body = await req.json();
    const genericSchema = z.object({
        data: z.string(),
        format: z.object({}).passthrough(),
    });

    const {data, format} = genericSchema.parse(body);
    const dynamicSchema = jsonSchemaToZod(format);

    type PromiseExecutor<T> = (resolve : (value: T)=> void, reject: (reason?: any)=> void)=> void;

    class RetryablePromise<T> extends Promise<T>{
        static async retry<T>(
            retries: number,
            executor: PromiseExecutor<T>
        ): Promise<T> {
            return new RetryablePromise(executor).catch((error: any)=>{
                console.error(`retrying due to error: ${error}`);
                return retries > 0 ? RetryablePromise.retry(retries - 1, executor) : RetryablePromise.reject(error);
            });
        };
    };
    const idk = RetryablePromise.retry(3, ()=>"Ajay")

};
