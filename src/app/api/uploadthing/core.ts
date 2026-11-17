import { MAX_IMAGE_FILE_SIZE } from '@/lib/upload-limits';
import {staffSession} from '@/lib/staff-session';
import { authenticated, sessionCookie } from '@/lib/auth';
import { cookies } from 'next/headers';
import { createUploadthing, type FileRouter } from 'uploadthing/next';
import { UploadThingError } from 'uploadthing/server';

const upload = createUploadthing();

export const fileRouter = {
  productImages: upload({ image: {
    // The SDK's runtime parser supports 5MB, but its types list only powers of two.
    // @ts-expect-error Supported runtime size, verified against fileSizeToBytes.
    maxFileSize: MAX_IMAGE_FILE_SIZE,
    maxFileCount: 10,
  } })
    .middleware(async ({ req }) => {
      if(!(await staffSession())?.permissions.includes('admin'))throw new UploadThingError('FORBIDDEN');
      const origin = req.headers.get('origin');
      if (origin && origin !== new URL(req.url).origin) {
        throw new UploadThingError('FORBIDDEN');
      }
      return {};
    })
    .onUploadComplete(({ file }) => ({ url: file.ufsUrl })),
} satisfies FileRouter;

export type ShopFileRouter = typeof fileRouter;
