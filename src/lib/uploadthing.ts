'use client';

import { useLocalUpload } from './local-upload';
import { generateReactHelpers } from '@uploadthing/react';
import type { ShopFileRouter } from '@/app/api/uploadthing/core';

const remote=generateReactHelpers<ShopFileRouter>();
export const useUploadThing=process.env.NODE_ENV==='development'?useLocalUpload:remote.useUploadThing;
