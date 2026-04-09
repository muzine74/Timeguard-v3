import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface AppConfigDto {
  logoPath:        string | null;
  companyName:     string | null;
  companyAddress:  string | null;
  companyPhone:    string | null;
  companyEmail:    string | null;
  smtpServer:      string | null;
  smtpPort:        number | null;
  smtpUser:        string | null;
  smtpPassword:    string | null;
  tpsNumber:       string | null;
  tvqNumber:       string | null;
  tpsRate:         number;
  tvqRate:         number;
  bankCoordinates: string | null;
  contactName:     string | null;
  contactPhone:    string | null;
  contactEmail:    string | null;
  appVersion:      string | null;
}

export interface ProviderDto {
  providerId: string | null;
  name:       string | null;
  mail:       string | null;
  phone:      string | null;
  notes:      string | null;
}

export interface AppConfigResponse {
  config:   AppConfigDto;
  provider: ProviderDto | null;
}

export function emptyConfig(): AppConfigDto {
  return {
    logoPath: null, companyName: null, companyAddress: null,
    companyPhone: null, companyEmail: null,
    smtpServer: null, smtpPort: null, smtpUser: null, smtpPassword: null,
    tpsNumber: null, tvqNumber: null, tpsRate: 5, tvqRate: 9.975,
    bankCoordinates: null,
    contactName: null, contactPhone: null, contactEmail: null,
    appVersion: null,
  };
}

export function emptyProvider(): ProviderDto {
  return { providerId: null, name: null, mail: null, phone: null, notes: null };
}

@Injectable({ providedIn: 'root' })
export class ConfigService {
  constructor(private http: HttpClient) {}

  get() {
    return this.http.get<AppConfigResponse>('/api/config');
  }

  save(config: AppConfigDto, provider: ProviderDto) {
    return this.http.put<{ message: string }>('/api/config', { config, provider });
  }
}
