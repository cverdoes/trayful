/** A picture file's name and contents as base64, once it is known to be a picture the browser reads. */
export async function readImage(file: File): Promise<{ name: string; base64: string }> {
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('The file could not be read.'));
    reader.readAsDataURL(file);
  });
  const image = new Image();
  image.src = url;
  await image.decode();
  return { name: file.name, base64: url.slice(url.indexOf(',') + 1) };
}
