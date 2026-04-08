import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface GroupSummary {
  groupId:       number;
  name:          string;
  description:   string;
  permissions:   string[];
  employeeCount: number;
}

export interface GroupDetail {
  groupId:     number;
  name:        string;
  description: string;
  permissions: string[];
  employeeIds: string[];
}

export interface GroupPayload {
  name:        string;
  description: string;
  permissions: string[];
  employeeIds: string[];
}

export interface PermissionDef {
  permissionId: number;
  key:          string;
  label:        string;
  module:       string;
}

export interface PermissionCreatePayload {
  key:    string;
  label:  string;
  module: string;
}

@Injectable({ providedIn: 'root' })
export class GroupsService {
  constructor(private http: HttpClient) {}

  getAll()                              { return this.http.get<GroupSummary[]>('/api/groups'); }
  getById(id: number)                   { return this.http.get<GroupDetail>(`/api/groups/${id}`); }
  create(p: GroupPayload)               { return this.http.post<{ groupId: number }>('/api/groups', p); }
  update(id: number, p: GroupPayload)   { return this.http.put<any>(`/api/groups/${id}`, p); }
  delete(id: number)                    { return this.http.delete<any>(`/api/groups/${id}`); }

  getPermissions()                      { return this.http.get<PermissionDef[]>('/api/groups/permissions'); }
  createPermission(p: PermissionCreatePayload) { return this.http.post<{ permissionId: number }>('/api/groups/permissions', p); }
  deletePermission(id: number)          { return this.http.delete<any>(`/api/groups/permissions/${id}`); }
}
