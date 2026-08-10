const CLOUDINARY_IMAGE_BASE =
  'https://res.cloudinary.com/dl2jdmgnq/image/upload/f_auto,q_auto/portfolio/hexi-road'

export function getImageUrl(image: string) {
  if (!image.startsWith('/images/')) {
    return image
  }

  const publicId = image.slice('/images/'.length).replace(/\.[^.]+$/, '')
  return `${CLOUDINARY_IMAGE_BASE}/${publicId}`
}
