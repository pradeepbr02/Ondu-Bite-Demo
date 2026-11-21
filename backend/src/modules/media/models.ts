import { Schema, model } from 'mongoose';
const schema = new Schema(
  {
    name: {
      type: String,
      match: /^(hero|categories|brand|product-[a-f0-9]{24})$/,
      required: true,
      unique: true,
    },
    key: { type: String, required: true },
    sha256: { type: String, required: true },
    contentType: { type: String, enum: ['image/webp'], required: true },
    byteLength: { type: Number, required: true },
    attribution: {
      type: new Schema(
        {
          title: String,
          sourceUrl: String,
          author: String,
          license: String,
          licenseUrl: String,
          changes: String,
        },
        { _id: false },
      ),
    },
  },
  { timestamps: true },
);
export const MediaAsset = model('MediaAsset', schema);
