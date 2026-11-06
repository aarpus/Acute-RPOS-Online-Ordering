import { homeData } from '../data/home';

export const defaultBrandSettings = {
  logo: homeData.store.logo, logoWidth: 56, hero: homeData.hero.image,
  navAlignment: 'left' as 'left' | 'center' | 'right',
  primaryColor: '#7A0E0E', headerColor: '#FFFFFF', footerColor: '#7A0E0E',
  footerTextColor: '#FFFFFF', accentColor: '#D0021B', textColor: '#FFFFFF',
  eyebrow: homeData.hero.eyebrow, subtitle: '', heading: homeData.hero.title,
  alignment: 'left' as const, overlay: 40,
};
