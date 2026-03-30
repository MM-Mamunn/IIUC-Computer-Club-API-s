import jwt from 'jsonwebtoken';

export const generateToken = (payload: object, expiresIn?: string) => {
  const options: jwt.SignOptions = {};
  if (expiresIn) {
    options.expiresIn = expiresIn as any;
  } else {
    options.expiresIn = '1d' as any;
  }
  return jwt.sign(payload, process.env.JWT_SECRET!, options);
};

export const verifyToken = (token: string) => {
  return jwt.verify(token, process.env.JWT_SECRET!);
};
