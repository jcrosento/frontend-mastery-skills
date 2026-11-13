// Dev and preview only. Delete this file, and the __variants__ folder, before merge.
//
//   const variant = pickVariant('home', ['a', 'b'] as const);
//   return variant === 'a' ? <HomeA {...props} /> : variant === 'b' ? <HomeB {...props} /> : <HomeView {...props} />;
//
// Switch in the browser with ?v-home=a. No parameter, or an unknown value, returns null,
// which must render the current production view.
export function pickVariant<T extends string>(screen: string, ids: readonly T[]): T | null {
  // Production builds ignore the switch unless a preview deployment opts in.
  const enabled = !import.meta.env.PROD || import.meta.env.VITE_ENABLE_VARIANTS === '1';
  if (!enabled || typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get(`v-${screen}`);
  return (ids as readonly string[]).includes(value ?? '') ? (value as T) : null;
}
