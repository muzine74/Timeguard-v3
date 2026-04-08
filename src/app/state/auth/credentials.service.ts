import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface CredentialResponse {
  credentialId: number;
  username:     string;
  employeeId:   string;
  employeeName: string;
  role:         string;
}

export interface CredentialCreatePayload {
  employeeId: string;
  username:   string;
  password:   string;
  role:       string;
}

@Injectable({ providedIn: 'root' })
export class CredentialsService {
  constructor(private http: HttpClient) {}

  getAll()                                    { return this.http.get<CredentialResponse[]>('/api/auth/credentials'); }
  create(p: CredentialCreatePayload)          { return this.http.post<{ credentialId: number }>('/api/auth/credentials', p); }
  resetPassword(id: number, pwd: string)      { return this.http.put<any>(`/api/auth/credentials/${id}/password`, { newPassword: pwd }); }
  delete(id: number)                          { return this.http.delete<any>(`/api/auth/credentials/${id}`); }
}
