export const DEMO_WORKSHOP_CREDENTIALS = {
  email: 'workshop@kaarigarlink.demo',
  password: 'WorkshopDemo2026!',
}

export type DemoLoginResult = { ok: true } | { ok: false; message: string }

export async function authenticateDemoWorkshop(email: string, password: string): Promise<DemoLoginResult> {
  await new Promise((resolve) => window.setTimeout(resolve, 450))

  if (
    email.trim().toLowerCase() !== DEMO_WORKSHOP_CREDENTIALS.email
    || password !== DEMO_WORKSHOP_CREDENTIALS.password
  ) {
    return { ok: false, message: 'Email or password is incorrect. Use the demo credentials shown below.' }
  }

  return { ok: true }
}
