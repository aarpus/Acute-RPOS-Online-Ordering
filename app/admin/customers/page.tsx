import CustomersPage from '../../../components/admin/CustomersPage';
import { Suspense } from 'react';
export default function CustomersRoute() { return <Suspense fallback={null}><CustomersPage /></Suspense>; }
