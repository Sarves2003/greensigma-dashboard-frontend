import { ApplicationConfig, LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEnIn from '@angular/common/locales/en-IN';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { authInterceptor } from './interceptors/auth.interceptor';

// Switches every `| number` / `| currency` / `| percent` pipe app-wide to Indian digit grouping
// (13,16,237 instead of 1,316,237) in one place, rather than touching each template individually.
registerLocaleData(localeEnIn);

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: LOCALE_ID, useValue: 'en-IN' },
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
  ],
};
