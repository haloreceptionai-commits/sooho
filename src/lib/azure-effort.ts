/** Newer Azure models (e.g. gpt-6.1-sol) reject reasoning effort "none"; older gpt-5/gpt-4 deployments keep it, others use their lightest level. */
export const effortFor = <E extends string>(deployment: string, effort: E): E | 'low' => (effort === 'none' && !/^gpt-(5|4)(?![.-]?\d)/i.test(deployment) && !/^gpt-5(-mini|-nano|-chat)?$/i.test(deployment) ? 'low' : effort);
