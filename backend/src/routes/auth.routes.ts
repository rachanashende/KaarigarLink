import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/authenticate';
import { demoLoginGuard } from '../middleware/demoLoginGuard';
import { changePasswordSchema, demoLoginSchema, loginSchema, registerSchema, updateProfileSchema } from '../validators/auth.validator';

const router = Router();

router.post('/register', validate({ body: registerSchema }), authController.register);
router.post('/login', validate({ body: loginSchema }), authController.login);
// Development only: the guard runs first, so a disabled server answers 404 for any body.
router.post('/demo-login', demoLoginGuard, validate({ body: demoLoginSchema }), authController.demoLogin);
router.get('/me', authenticate, authController.me);
router.patch('/me', authenticate, validate({ body: updateProfileSchema }), authController.updateMe);
router.patch('/me/password', authenticate, validate({ body: changePasswordSchema }), authController.changePassword);

export default router;
