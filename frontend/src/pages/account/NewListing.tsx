import { navigate } from '../../app/navigation';
import { ListingForm } from '../../features/listing-form/ListingForm';
import type { ListingFormValues } from '../../features/listing-form/model';
import { createListing } from '../../shared/api/create-listing';

type Props = { initialValues?: ListingFormValues; onChange: (values: ListingFormValues) => void; recheck: (unauthorized: boolean) => void };

export default function NewListing({ initialValues, onChange, recheck }: Props) {
  return <ListingForm initialValues={initialValues} onChange={onChange}
    onSave={(data, signal) => { recheck(false); return createListing({ data }, signal); }}
    onSaved={(id) => navigate(`/app/listings/${id}`)} onUnauthorized={() => recheck(true)} />;
}
