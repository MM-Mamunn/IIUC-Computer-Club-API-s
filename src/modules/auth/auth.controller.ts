import type { Context } from "hono";
import { registerUser, loginUser, saveImage } from "./auth.service";
import { uploadImageToCloudinary } from "../../utils/uploadImage";

export const register = async (c: Context) => {
  
console.log("in auth controller register function");

  const { id,name, email, password } = await c.req.json();
 console.log(id,name,email,password);
 


  const user = await registerUser(id, name, email, password);
  return c.json({ token: user.token.token }, 201);
};

export const login = async (c: Context) => {
  console.log("in controller log in");
  
  const { id, password } = await c.req.json();
  const result = await loginUser(id, password);
  return c.json(result);
};

export const uploadImage = async (c: Context) => {
  // Parse multipart form data
  const body = await c.req.parseBody();

  const file = body.image as File;

  if (!file) {
    return c.json({ message: "Image file is required" }, 400);
  }

  try {
    const imageUrl = await uploadImageToCloudinary(file);

    const url = await saveImage(imageUrl, c);
    return c.json(url);
  } catch (error) {
    console.error("Upload error:", error);
    return c.json({ message: "Image upload failed" }, 500);
  }
};