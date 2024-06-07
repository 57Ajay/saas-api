import { openai } from "@/app/lib/openai";
import { NextRequest, NextResponse } from "next/server";
import { number, z, ZodTypeAny } from "zod";
import { EXAMPLE_ANSWER, EXAMPLE_PROMPT } from "./example";

const determineSchemaType = (schema: any) => {
    if(!schema.hasOwnProperty("type")){
        if(Array.isArray(schema)){
            return "array";
        }else{
            return typeof schema;
        };
    };
    return schema.type;
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
    const validationResult = RetryablePromise.retry<object>(3, async (resolve, reject)=>{
        try{
            const content = `DATA: \n"${data}"\n\n-----------\nExpected JSON format: ${JSON.stringify(format, null, 2)}
            \n\n-----------\nValid JSON output in expected format:`

            const res = await openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    {
                        role: "assistant",
                        content: `You are an AI that converts the data into the attached JOSN Formats. You respond with nothing but Valid JSON base on input data. Your outPut should be valid JSON, Nothing added before and after. You will begin with opening curlyBraces and ends with closing curlyBraces.Only if you absolutely can not determine a field, use the value null`,
                    },
                    {
                        role: "user",
                        content: EXAMPLE_PROMPT,
                    },
                    {
                        role: "user",
                        content: EXAMPLE_ANSWER
                    },
                    {
                        role: 'user',
                        content: content
                    }
                ],
            })
            const text = res.choices[0].message?.content;
            const validationResult = dynamicSchema.parse(JSON.parse(text|| ""));
        }catch(error){
            reject(error);
        };
    })
    return NextResponse.json(validationResult, {status: 200});
};
