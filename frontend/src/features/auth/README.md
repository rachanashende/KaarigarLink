# Auth · Member 4

Phase 1 implements LoginPage, AuthProvider and useAuth(). Login validation and AuthService live in shared services; mock authentication uses the provider-owned DataService.

Public demo password: DemoPass123!. Session storage contains version/userId/expiry only. No real credentials, tokens or backend authentication are implemented.

Use useAuth() inside the shared application providers. Central route guards are in app/router.tsx, and logout is owned by the shared AppShell.
