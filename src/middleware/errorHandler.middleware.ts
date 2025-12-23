import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger.util';

interface CustomError extends Error {
  statusCode?: number;
  errors?: any[];
  upgradePlan?: string;
  upgradeUrl?: string;
  currentUsage?: number;
  limit?: number;
  resource?: string;
  feature?: string;
  subscriptionStatus?: string;
}

/**
 * Custom error classes for subscription-related errors
 */
export class SubscriptionExpiredError extends Error {
  statusCode = 403;
  subscriptionStatus: string;
  upgradeUrl?: string;

  constructor(message: string, subscriptionStatus: string, upgradeUrl?: string) {
    super(message);
    this.name = 'SubscriptionExpiredError';
    this.subscriptionStatus = subscriptionStatus;
    this.upgradeUrl = upgradeUrl;
  }
}

export class PlanLimitReachedError extends Error {
  statusCode = 403;
  resource: string;
  currentUsage?: number;
  limit?: number;
  upgradePlan?: string;
  upgradeUrl?: string;

  constructor(
    message: string,
    resource: string,
    currentUsage?: number,
    limit?: number,
    upgradePlan?: string,
    upgradeUrl?: string
  ) {
    super(message);
    this.name = 'PlanLimitReachedError';
    this.resource = resource;
    this.currentUsage = currentUsage;
    this.limit = limit;
    this.upgradePlan = upgradePlan;
    this.upgradeUrl = upgradeUrl;
  }
}

export class FeatureNotAvailableError extends Error {
  statusCode = 403;
  feature: string;
  currentPlan: string;
  upgradePlan?: string;
  upgradeUrl?: string;

  constructor(
    message: string,
    feature: string,
    currentPlan: string,
    upgradePlan?: string,
    upgradeUrl?: string
  ) {
    super(message);
    this.name = 'FeatureNotAvailableError';
    this.feature = feature;
    this.currentPlan = currentPlan;
    this.upgradePlan = upgradePlan;
    this.upgradeUrl = upgradeUrl;
  }
}

export class StorageLimitReachedError extends Error {
  statusCode = 403;
  currentUsage?: number;
  limit?: number;
  upgradePlan?: string;
  upgradeUrl?: string;

  constructor(
    message: string,
    currentUsage?: number,
    limit?: number,
    upgradePlan?: string,
    upgradeUrl?: string
  ) {
    super(message);
    this.name = 'StorageLimitReachedError';
    this.currentUsage = currentUsage;
    this.limit = limit;
    this.upgradePlan = upgradePlan;
    this.upgradeUrl = upgradeUrl;
  }
}

export const errorHandler = (
  err: CustomError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  logger.error('Error:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    errorName: err.name,
  });

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  // Handle subscription-related errors with upgrade prompts
  if (err instanceof SubscriptionExpiredError) {
    res.status(statusCode).json({
      error: message,
      type: 'SubscriptionExpiredError',
      subscriptionStatus: err.subscriptionStatus,
      upgradeUrl: err.upgradeUrl,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
    return;
  }

  if (err instanceof PlanLimitReachedError) {
    res.status(statusCode).json({
      error: message,
      type: 'PlanLimitReachedError',
      resource: err.resource,
      currentUsage: err.currentUsage,
      limit: err.limit,
      upgradePlan: err.upgradePlan,
      upgradeUrl: err.upgradeUrl,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
    return;
  }

  if (err instanceof FeatureNotAvailableError) {
    res.status(statusCode).json({
      error: message,
      type: 'FeatureNotAvailableError',
      feature: err.feature,
      currentPlan: err.currentPlan,
      upgradePlan: err.upgradePlan,
      upgradeUrl: err.upgradeUrl,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
    return;
  }

  if (err instanceof StorageLimitReachedError) {
    res.status(statusCode).json({
      error: message,
      type: 'StorageLimitReachedError',
      currentUsage: err.currentUsage,
      limit: err.limit,
      upgradePlan: err.upgradePlan,
      upgradeUrl: err.upgradeUrl,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
    return;
  }

  // Default error response
  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    ...(err.errors && { errors: err.errors }),
  });
};

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    error: 'Route not found',
    path: req.url,
  });
};

