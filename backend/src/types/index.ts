export interface Order {
  key: string;
  customer: string;
  time: string; // "YYYY-MM-DD HH:mm"
  content: string;
  status: 'NEW' | 'ACCEPTED' | 'DONE' | 'PICKED_UP' | 'WAITING_CUSTOMER_CHANGE' | 'WAITING_CUSTOMER_REJECT' | 'REJECTED';
  createdAt: number;
  userId: string;
  total: number;
  reason?: string;
  note?: string;
}

export interface Menu {
  [category: string]: {
    [itemName: string]: number;
  };
}

export interface StoreConfig {
  operatingHours?: string | null;
  liffId?: string | null;
  [key: string]: any;
}
