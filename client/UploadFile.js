import { supabase } from './supabaseClient';
import { useState } from 'react';

export default function UploadFile({ user }) {
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState('');

  const handleUpload = async () => {
    if (!file || !user) return alert('Missing file or user');

    const fileExt = file.name.split('.').pop();
    const filePath = `${user.id}/${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('user-files')
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      console.error('Upload error:', uploadError.message);
      return;
    }

    const { data: publicData } = supabase
      .storage
      .from('user-files')
      .getPublicUrl(filePath);

    setUrl(publicData.publicUrl);
    console.log('Uploaded file URL:', publicData.publicUrl);
  };

  return (
    <div>
      <input type="file" onChange={(e) => setFile(e.target.files[0])} />
      <button onClick={handleUpload}>Upload File</button>
      {url && <p>Public URL: <a href={url}>{url}</a></p>}
    </div>
  );
}

