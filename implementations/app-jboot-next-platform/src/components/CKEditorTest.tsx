"use client";

import React from "react";
import { CKEditor } from "@ckeditor/ckeditor5-react";
import {
  ClassicEditor,
  jbootClassicEditorConfig,
} from "@/components/Common/ckeditor-config";

const CKEditorTest = () => {
  return (
    <div>
      <CKEditor
        editor={ClassicEditor}
        config={jbootClassicEditorConfig}
        data="<p>Hello from CKEditor 5!</p>"
        onReady={(editor: any) => {
          console.log("Editor is ready to use!", editor);
        }}
      />
    </div>
  );
};

export default CKEditorTest;
