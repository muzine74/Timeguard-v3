import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface NoteItem {
  noteId:      string;
  title:       string;
  description: string;
  isActive:    boolean;
  createdAt:   string;
}

export interface NoteCreatePayload {
  title:       string;
  description: string;
  isActive:    boolean;
}

@Injectable({ providedIn: 'root' })
export class NotesService {
  constructor(private http: HttpClient) {}

  getAll() {
    return this.http.get<NoteItem[]>('/api/notes');
  }

  create(payload: NoteCreatePayload) {
    return this.http.post<{ noteId: string; message: string }>('/api/notes', payload);
  }

  update(id: string, payload: NoteCreatePayload) {
    return this.http.put<{ message: string }>(`/api/notes/${id}`, payload);
  }

  setActive(id: string, isActive: boolean) {
    return this.http.patch<{ message: string }>(`/api/notes/${id}/active`, { isActive });
  }

  delete(id: string) {
    return this.http.delete<{ message: string }>(`/api/notes/${id}`);
  }
}
