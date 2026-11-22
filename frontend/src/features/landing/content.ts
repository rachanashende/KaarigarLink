// Public category labels only; seed provenance is verified in LandingPage.test.tsx.
export const publicCapabilities = [
  { name: 'CNC machining', detail: 'Detailed milling and drilling requirements, ready for a workshop to review.', code: 'CNC / MILLING' },
  { name: 'Sheet metal fabrication', detail: 'From cut profiles to formed parts, start with a clear fabrication brief.', code: 'CUT / FORM' },
  { name: 'CNC turning', detail: 'Define the material, quantity and specifications for your turned components.', code: 'CNC / TURNING' },
  { name: 'Tool making', detail: 'Give workshops the context they need to understand your tooling requirement.', code: 'TOOLS / TOOLING' },
] as const;
