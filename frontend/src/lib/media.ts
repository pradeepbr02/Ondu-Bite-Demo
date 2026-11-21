export const mediaPath = (name: 'hero' | 'categories' | 'brand') => `/media/${name}`;

// Serving photographs from the storefront's private S3 media collection.
export const servingPhotos = {
  upma: '/media/product-38e298d48032ecf579662a3f',
  poha: '/media/product-067e2d1b00d9b1eebcdfbb1e',
  idli: '/media/product-ef7be32e78789a67433d3817',
  coffee: '/media/product-c85442f1671f774cac326965',
  chakli: '/media/product-81aef44c52de8f2765adaefd',
};

export const categoryServingPhotos: Partial<Record<string, string>> = {
  'ready-to-eat': servingPhotos.poha,
  'ready-to-mix': servingPhotos.idli,
  coffee: servingPhotos.coffee,
  snacks: servingPhotos.chakli,
};
