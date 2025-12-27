import dotenv from "dotenv";

dotenv.config();

async function listModels() {
    try {
        const result = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${process.env.GEMINI_API_KEY}`);
        const data: any = await result.json();
        if (data && data.models) {
            console.log(data.models.map((m: any) => m.name));
        } else {
            console.log("No models found or error in response:", data);
        }
    } catch (err) {
        console.error(err);
    }
}

listModels();
