'use client';
import StoresPage from './StoresPage';
import BrandingWorkspace from './BrandingWorkspace';
export default function StoresBrandingScreen({ branding = false }: { branding?: boolean }) { return branding ? <BrandingWorkspace /> : <StoresPage />; }
