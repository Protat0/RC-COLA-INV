"""
URL configuration for config project.

Main URL routing for the POS Backend API system.
Routes requests to specialized API modules:
- /api/v1/admin/ - Back office/admin operations
- /api/v1/pos/ - Point of sale operations
- /api/v1/web/ - Customer-facing website operations
"""
from django.contrib import admin
from django.urls import path, include
from django.http import HttpResponse
from api.website import customer_auth_views, oauth_views

urlpatterns = [
    # Django Admin
    path('admin/', admin.site.urls),

    # API v1 Routes
    path('api/v1/admin/', include('api.back_office.urls')),  # Back office/admin endpoints
    path('api/v1/pos/', include('api.pos.urls')),            # POS endpoints
    path('api/v1/web/', include('api.website.urls')),        # Customer-facing endpoints
    path('api/v1/notifications/', include('notifications.urls')),  # Notifications

    # Auth routes matching frontend expectations
    path('api/v1/auth/customer/register/', customer_auth_views.CustomerRegisterView.as_view()),
    path('api/v1/auth/customer/login/', customer_auth_views.CustomerLoginView.as_view()),
    path('api/v1/auth/customer/logout/', customer_auth_views.CustomerLogoutView.as_view()),
    path('api/v1/auth/customer/profile/', customer_auth_views.CustomerProfileView.as_view()),
    path('api/v1/auth/token/refresh/', customer_auth_views.CustomerTokenRefreshView.as_view()),
    path('api/v1/auth/oauth/<str:provider>/authorize/', oauth_views.OAuthAuthorizeView.as_view()),
    path('api/v1/auth/oauth/callback/', oauth_views.OAuthCallbackView.as_view()),
    
    # Legacy/fallback routes (can be removed after migration)
    # path('api/v1/', include('app.urls')),  # Old monolithic URLs - DEPRECATED
    
    # Health check / Root
    path('', lambda request: HttpResponse("POS System API is running!")),
]
