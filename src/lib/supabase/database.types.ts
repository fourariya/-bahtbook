/**
 * Types for the tables in `supabase/migrations`. Written by hand to match the
 * migration; once a Supabase project exists they can be regenerated with
 * `supabase gen types typescript`.
 */
type TransactionType = "income" | "expense";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; display_name: string; created_at: string };
        Insert: { id: string; display_name: string; created_at?: string };
        Update: { display_name?: string };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          type: TransactionType;
          color: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          type: TransactionType;
          color?: string;
          created_at?: string;
        };
        Update: { name?: string; color?: string };
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          category_id: string;
          type: TransactionType;
          amount_satang: number;
          description: string;
          transaction_date: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          category_id: string;
          type: TransactionType;
          amount_satang: number;
          description: string;
          transaction_date: string;
        };
        Update: {
          category_id?: string;
          type?: TransactionType;
          amount_satang?: number;
          description?: string;
          transaction_date?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
