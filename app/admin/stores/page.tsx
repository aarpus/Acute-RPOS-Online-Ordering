import StoresPage from '../../../components/admin/StoresPage';
import { Suspense } from 'react';
export default function StoresRoute() { return <Suspense fallback={null}><StoresPage /></Suspense>; }
