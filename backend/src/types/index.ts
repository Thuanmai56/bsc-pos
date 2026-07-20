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
  small?: { [itemName: string]: number };
  large?: { [itemName: string]: number };
  combo?: { [itemName: string]: number };
  drinks?: { [itemName: string]: number };
  topping?: { [itemName: string]: number };
  out_of_stock?: string[];
  [category: string]: any;
}

export interface StoreConfig {
  operatingHours?: string | null;
  liffId?: string | null;
  [key: string]: any;
}
