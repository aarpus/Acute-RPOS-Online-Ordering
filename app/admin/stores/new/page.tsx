import StoresPage from '../../../../components/admin/StoresPage';
import { Suspense } from 'react';

export default function StoreFormRoute() { return <Suspense fallback={null}><StoresPage mode="form" /></Suspense>; }
