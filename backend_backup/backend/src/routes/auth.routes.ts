import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/authenticate';
import { loginSchema, registerSchema } from '../validators/auth.validator';

const router = Router();

router.post('/register', validate({ body: registerSchema }), authController.register);
router.post('/login', validate({ body: loginSchema }), authController.login);
router.get('/me', authenticate, authController.me);

export default router;
