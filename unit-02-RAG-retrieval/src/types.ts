export interface HandbookDocument {
  title: string;
  documentId: string;
  revision: string;
  status: string;
  sourceFile: string;
  content: string;
}

export interface Citation {
  documentId: string;
  title: string;
  revision: string;
  sourceFile: string;
}

export interface VerificationResult {
  supported: boolean;
  unsupportedClaims: string[];
  reason: string;
}
