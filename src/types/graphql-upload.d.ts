declare module 'graphql-upload/Upload.mjs' {
  import { ReadStream } from 'fs';

  export interface FileUpload {
    filename: string;
    mimetype: string;
    encoding: string;
    createReadStream: () => ReadStream;
  }

  export default class Upload {
    promise: Promise<FileUpload>;
  }
}

declare module 'graphql-upload/GraphQLUpload.mjs' {
  import { GraphQLScalarType } from 'graphql';
  const GraphQLUpload: GraphQLScalarType;
  export default GraphQLUpload;
}

declare module 'graphql-upload/graphqlUploadExpress.mjs' {
  import { RequestHandler } from 'express';
  
  interface GraphQLUploadExpressOptions {
    maxFileSize?: number;
    maxFiles?: number;
  }

  export default function graphqlUploadExpress(
    options?: GraphQLUploadExpressOptions
  ): RequestHandler;
}
