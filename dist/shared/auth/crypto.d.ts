export declare const hashPassword: (rawPassword: string) => Promise<string>;
export declare const comparePassword: (rawPassword: string, passwordHash: string) => Promise<boolean>;
export declare const randomToken: (bytes?: number) => string;
export declare const sha256: (value: string) => string;
export declare const slugify: (value: string) => string;
//# sourceMappingURL=crypto.d.ts.map