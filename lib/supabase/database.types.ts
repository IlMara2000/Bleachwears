export type ProductRow = {
  id: string;
  slug: string;
  name: string;
  category: "tee" | "hoodie" | "oneoff";
  kind: string;
  price_cents: number;
  status: string;
  color: string;
  reaction: string;
  art: "halo" | "bloom" | "static" | "ghost" | "void" | "oneoff";
  active: boolean;
  position: number;
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      products: {
        Row: ProductRow;
        Insert: Omit<ProductRow, "created_at" | "updated_at"> & {
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<ProductRow, "id" | "created_at">> & {
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
